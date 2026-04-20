package com.EazyCount.dao;

import com.EazyCount.entity.OwnerCompanyRow;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuthOwnerMapper {

    List<OwnerCompanyRow> selectOwnerCandidates(@Param("loginId") String loginId, @Param("companyId") String companyId);

    void updateOwnerPassword(@Param("ownerId") long ownerId, @Param("password") String password);
}
